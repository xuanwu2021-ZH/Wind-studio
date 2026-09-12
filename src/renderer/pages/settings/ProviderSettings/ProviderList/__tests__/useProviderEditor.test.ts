import type * as ImageUtils from '@renderer/utils/image'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProviderEditor } from '../useProviderEditor'

const uuidMock = vi.fn().mockReturnValue('new-provider-id')

vi.mock('@renderer/utils/uuid', () => ({
  uuid: () => uuidMock()
}))

const useProvidersMock = vi.fn()
const useProviderActionsMock = vi.fn()
const invalidateMock = vi.fn()

vi.mock('@renderer/hooks/useProvider', () => ({
  useProviders: (...args: any[]) => useProvidersMock(...args),
  useProviderActions: (...args: any[]) => useProviderActionsMock(...args),
  // useProviderModelSync looks up the new provider by id. Default to "not found"
  // so the sync no-ops on the fetch path; tests that want to exercise the
  // sync can override useProviderMock per-test.
  useProvider: (...args: any[]) => useProviderMock(...args)
}))

const useQueryMock = vi.fn().mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() })
const useMutationMock = vi.fn().mockReturnValue({
  trigger: vi.fn(),
  isLoading: false,
  error: undefined
})
const useDataChangeMock = vi.fn()

vi.mock('@data/hooks/useDataApi', () => ({
  useInvalidateCache: () => invalidateMock,
  useQuery: (...args: any[]) => useQueryMock(...args),
  useMutation: (...args: any[]) => useMutationMock(...args),
  useDataChange: (...args: any[]) => useDataChangeMock(...args)
}))

const dataApiGetMock = vi.fn().mockResolvedValue([])
vi.mock('@data/DataApiService', () => ({
  dataApiService: { get: (...args: any[]) => dataApiGetMock(...args), post: vi.fn() }
}))
const ipcRequestMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@renderer/ipc', () => ({
  // Default route returns nothing; tests that exercise the model sync can
  // override this for the specific `ai.provider.model.list` route.
  ipcApi: { request: (...args: any[]) => ipcRequestMock(...args) }
}))

// useProviderModelSync also calls useProvider(providerId). Stub it with no provider
// so the sync path's downstream checks no-op; tests that need to exercise the
// sync behaviour can override useProviderMock per-test.
const useProviderMock = vi.fn().mockReturnValue({ provider: undefined })

// Canvas isn't available in jsdom; stub the renderer normalize step to fixed bytes.
vi.mock('@renderer/utils/image', async (importOriginal) => ({
  ...(await importOriginal<typeof ImageUtils>()),
  prepareEntityImageBytes: vi.fn(async () => new Uint8Array([1, 2, 3]))
}))

const createProviderMock = vi.fn()
const updateProviderByIdMock = vi.fn()
const onProviderCreatedMock = vi.fn()

function makeParams(overrides = {}) {
  return {
    onProviderCreated: onProviderCreatedMock,
    ...overrides
  }
}

const provider = { id: 'openai', name: 'OpenAI' } as any
const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
describe('useProviderEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createProviderMock.mockResolvedValue({ id: 'new-provider-id', name: 'My Provider' })
    updateProviderByIdMock.mockResolvedValue(undefined)
    ipcRequestMock.mockResolvedValue(undefined)
    invalidateMock.mockResolvedValue(undefined)
    useProvidersMock.mockReturnValue({
      createProvider: createProviderMock
    })
    useProviderActionsMock.mockReturnValue({
      updateProviderById: updateProviderByIdMock
    })
  })

  describe('initial state', () => {
    it('starts closed with no editing provider', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))
      expect(result.current.isOpen).toBe(false)
      expect(result.current.editingProvider).toBeNull()
      expect(result.current.initialLogo).toBeUndefined()
    })
  })

  describe('state transitions', () => {
    it('startAdd opens the editor in create-custom mode', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())

      expect(result.current.isOpen).toBe(true)
      expect(result.current.editingProvider).toBeNull()
      expect(result.current.mode).toEqual({ kind: 'create-custom' })
    })

    it('startAddFrom opens the editor in duplicate mode with the source provider', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))
      const source = { ...provider, presetProviderId: 'openai', authType: 'api-key' }

      act(() => result.current.startAddFrom(source))

      expect(result.current.isOpen).toBe(true)
      expect(result.current.editingProvider).toBeNull()
      expect(result.current.mode).toEqual({ kind: 'duplicate', source })
    })

    it('startEdit opens the editor in edit mode with the given provider', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))

      expect(result.current.isOpen).toBe(true)
      expect(result.current.editingProvider).toBe(provider)
    })

    it('exposes the editing provider logo as initialLogo', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit({ id: 'openai', name: 'OpenAI', logo: 'icon:openai' } as any))

      expect(result.current.initialLogo).toBe('icon:openai')
    })

    it('startAdd clears editingProvider when switching from edit mode', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      act(() => result.current.startAdd())

      expect(result.current.editingProvider).toBeNull()
    })

    it('cancel closes the editor and clears editingProvider', () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      act(() => result.current.cancel())

      expect(result.current.isOpen).toBe(false)
      expect(result.current.editingProvider).toBeNull()
    })
  })

  describe('submit — create path', () => {
    it('calls createProvider with a new uuid, then onProviderCreated and closes', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({ mode: 'create', name: 'My Provider', defaultChatEndpoint: endpoint })
      })

      expect(createProviderMock).toHaveBeenCalledWith({
        providerId: 'new-provider-id',
        name: 'My Provider',
        defaultChatEndpoint: endpoint
      })
      expect(onProviderCreatedMock).toHaveBeenCalledWith('new-provider-id')
      expect(result.current.isOpen).toBe(false)
    })

    it('includes a preset-key logo in the createProvider DTO', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'My Provider',
          defaultChatEndpoint: endpoint,
          logo: { kind: 'key', key: 'icon:openai' }
        })
      })

      expect(createProviderMock).toHaveBeenCalledWith({
        providerId: 'new-provider-id',
        name: 'My Provider',
        defaultChatEndpoint: endpoint,
        logo: { kind: 'key', key: 'icon:openai' }
      })
      expect(ipcRequestMock).not.toHaveBeenCalled()
    })

    it('creates the row without logo then uploads an image via provider.set_logo', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))
      // jsdom's File lacks arrayBuffer(); provide a file-like with it.
      const file = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as File

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'My Provider',
          defaultChatEndpoint: endpoint,
          logo: { kind: 'image', file }
        })
      })

      expect(createProviderMock.mock.calls[0][0]).not.toHaveProperty('logo')
      expect(ipcRequestMock).toHaveBeenCalledWith(
        'provider.set_logo',
        expect.objectContaining({ providerId: 'new-provider-id', image: expect.objectContaining({ kind: 'image' }) })
      )
      expect(invalidateMock).toHaveBeenCalledWith([
        '/providers',
        '/providers/new-provider-id',
        '/providers/new-provider-id/*'
      ])
    })

    it('omits logo from the createProvider DTO when not provided', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({ mode: 'create', name: 'My Provider', defaultChatEndpoint: endpoint })
      })

      expect(createProviderMock.mock.calls[0][0]).not.toHaveProperty('logo')
    })

    it('does nothing when name is empty', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({ mode: 'create', name: '   ', defaultChatEndpoint: endpoint })
      })

      expect(createProviderMock).not.toHaveBeenCalled()
      expect(result.current.isOpen).toBe(true)
    })

    it('forwards endpointConfigs and authConfig to createProvider', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'Custom OpenAI Proxy',
          defaultChatEndpoint: endpoint,
          endpointConfigs: { [endpoint]: { baseUrl: 'https://proxy.example.com' } },
          authConfig: { type: 'api-key' }
        })
      })

      expect(createProviderMock).toHaveBeenCalledWith({
        providerId: 'new-provider-id',
        name: 'Custom OpenAI Proxy',
        defaultChatEndpoint: endpoint,
        endpointConfigs: { [endpoint]: { baseUrl: 'https://proxy.example.com' } },
        authConfig: { type: 'api-key' }
      })
    })

    it('forwards presetProviderId on duplicate-mode submit', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))
      const source = { ...provider, presetProviderId: 'azure-openai', authType: 'iam-azure' }

      act(() => result.current.startAddFrom(source))
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'azure-2',
          defaultChatEndpoint: endpoint,
          presetProviderId: 'azure-openai',
          authConfig: { type: 'iam-azure', apiVersion: '' }
        })
      })

      expect(createProviderMock).toHaveBeenCalledWith({
        providerId: 'new-provider-id',
        name: 'azure-2',
        defaultChatEndpoint: endpoint,
        presetProviderId: 'azure-openai',
        authConfig: { type: 'iam-azure', apiVersion: '' }
      })
    })
  })

  describe('submit — update path', () => {
    it('calls updateProviderById and closes the editor', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      await act(async () => {
        await result.current.submit({ mode: 'edit', name: 'Renamed', defaultChatEndpoint: endpoint })
      })

      expect(updateProviderByIdMock).toHaveBeenCalledWith('openai', {
        name: 'Renamed',
        defaultChatEndpoint: endpoint
      })
      expect(createProviderMock).not.toHaveBeenCalled()
      expect(result.current.isOpen).toBe(false)
    })

    it('sets a logo edit via provider.set_logo, not the update DTO', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      await act(async () => {
        await result.current.submit({
          mode: 'edit',
          name: 'Renamed',
          defaultChatEndpoint: endpoint,
          logo: { kind: 'key', key: 'icon:openai' }
        })
      })

      // The PATCH carries only name/endpoint; the logo goes through the command.
      expect(updateProviderByIdMock).toHaveBeenCalledWith('openai', {
        name: 'Renamed',
        defaultChatEndpoint: endpoint
      })
      expect(ipcRequestMock).toHaveBeenCalledWith('provider.set_logo', {
        providerId: 'openai',
        image: { kind: 'key', key: 'icon:openai' }
      })
      expect(invalidateMock).toHaveBeenCalledWith(['/providers', '/providers/openai', '/providers/openai/*'])
    })

    it('resets the logo to default via provider.set_logo on update', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      await act(async () => {
        await result.current.submit({
          mode: 'edit',
          name: 'Renamed',
          defaultChatEndpoint: endpoint,
          logo: { kind: 'default' }
        })
      })

      expect(updateProviderByIdMock.mock.calls[0][1]).not.toHaveProperty('logo')
      expect(ipcRequestMock).toHaveBeenCalledWith('provider.set_logo', {
        providerId: 'openai',
        image: { kind: 'default' }
      })
    })

    it('does not call provider.set_logo when logo is undefined on update', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startEdit(provider))
      await act(async () => {
        await result.current.submit({ mode: 'edit', name: 'Renamed', defaultChatEndpoint: endpoint })
      })

      expect(updateProviderByIdMock.mock.calls[0][1]).not.toHaveProperty('logo')
      expect(ipcRequestMock).not.toHaveBeenCalled()
      expect(invalidateMock).not.toHaveBeenCalled()
    })

    it('does not call onProviderCreated on update', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))
      act(() => result.current.startEdit(provider))
      await act(async () => {
        await result.current.submit({ mode: 'edit', name: 'Renamed', defaultChatEndpoint: endpoint })
      })

      expect(onProviderCreatedMock).not.toHaveBeenCalled()
    })
  })

  describe('auto-sync models on preset provider create', () => {
    /**
     * The new behavior: when the user creates a preset-backed provider (presetProviderId
     * is set), the editor must call the model-sync hook so the agent-composer picker
     * shows models under the new provider without requiring a manual "Sync Models"
     * trip into the settings UI. Custom providers (no presetProviderId) skip the
     * sync entirely — the user types their own model ids in the next step.
     */
    it('auto-syncs models for a preset-backed provider', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'DeepSeek',
          defaultChatEndpoint: endpoint,
          presetProviderId: 'deepseek'
        })
      })

      // The auto-sync dispatches the IPC `ai.provider.model.list` route
      // (mocked by ipcRequestMock) for the new provider. The mock throws
      // synchronously — the editor catches it and continues, so the test
      // only needs to verify the route was hit.
      const modelListCalls = ipcRequestMock.mock.calls.filter(
        ([route]) => route === 'ai.provider.model.list'
      )
      expect(modelListCalls).toHaveLength(1)
      expect(modelListCalls[0][1]).toMatchObject({ providerId: 'new-provider-id' })
    })

    it('does not auto-sync for a custom (non-preset) provider', async () => {
      const { result } = renderHook(() => useProviderEditor(makeParams()))

      act(() => result.current.startAdd())
      ipcRequestMock.mockClear()
      await act(async () => {
        await result.current.submit({
          mode: 'create',
          name: 'My custom LLM',
          defaultChatEndpoint: endpoint
        })
      })

      // Without presetProviderId, the auto-sync code path is skipped entirely.
      const modelListCalls = ipcRequestMock.mock.calls.filter(
        ([route]) => route === 'ai.provider.model.list'
      )
      expect(modelListCalls).toHaveLength(0)
      expect(createProviderMock).toHaveBeenCalled()
    })
  })
})
