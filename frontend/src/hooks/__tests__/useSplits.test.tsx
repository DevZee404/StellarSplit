import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { useSplits } from '../useSplits';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiRoutes } from '../../services/apiRouteRegistry';

const mockSplits = [
  {
    id: "test-1",
    totalAmount: 100,
    amountPaid: 0,
    status: "active",
    participants: []
  }
];

const server = setupServer(
  http.get(`*${ApiRoutes.splits.list()}`, () => {
    return HttpResponse.json(mockSplits);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useSplits', () => {
  it('should fetch splits successfully', async () => {
    const originalEnv = import.meta.env.VITE_BASE_API_URL;
    import.meta.env.VITE_BASE_API_URL = 'http://localhost:3000';
    
    const { result } = renderHook(() => useSplits());
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.data).toEqual(mockSplits);
    expect(result.current.error).toBeNull();

    import.meta.env.VITE_BASE_API_URL = originalEnv;
  });

  it('should return mock data when VITE_BASE_API_URL is not set', async () => {
    const originalEnv = import.meta.env.VITE_BASE_API_URL;
    delete (import.meta.env as any).VITE_BASE_API_URL;
    
    const { result } = renderHook(() => useSplits());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.data?.length).toBeGreaterThan(0);
    expect(result.current.data?.[0].id).toBe('mock-1');
    expect(result.current.error).toBeNull();

    import.meta.env.VITE_BASE_API_URL = originalEnv;
  });

  it('should handle API errors', async () => {
    const originalEnv = import.meta.env.VITE_BASE_API_URL;
    import.meta.env.VITE_BASE_API_URL = 'http://localhost:3000';
    
    server.use(
      http.get(`*${ApiRoutes.splits.list()}`, () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    const { result } = renderHook(() => useSplits());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();

    import.meta.env.VITE_BASE_API_URL = originalEnv;
  });
});
