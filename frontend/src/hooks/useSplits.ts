import { useAbortableRequest } from './useAbortableRequest';
import { apiClient, type ApiSplitRecord } from '../utils/api-client';
import { ApiRoutes } from '../services/apiRouteRegistry';

export function useSplits() {
    return useAbortableRequest(
        async (signal) => {
            const VITE_BASE_API_URL = import.meta.env.VITE_BASE_API_URL;
            if (!VITE_BASE_API_URL) {
                // Mock data when no API
                return [
                    {
                        id: "mock-1",
                        totalAmount: 150.00,
                        amountPaid: 50.00,
                        status: "active",
                        description: "Dinner at Luigi's",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        participants: [
                            { id: "p1", userId: "u1", amountOwed: 75, amountPaid: 50, status: 'partial' },
                            { id: "p2", userId: "u2", amountOwed: 75, amountPaid: 0, status: 'pending' },
                        ],
                    } as ApiSplitRecord,
                    {
                        id: "mock-2",
                        totalAmount: 42.50,
                        amountPaid: 42.50,
                        status: "completed",
                        description: "Movie tickets",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        participants: [
                            { id: "p3", userId: "u1", amountOwed: 21.25, amountPaid: 21.25, status: 'paid' },
                            { id: "p4", userId: "u3", amountOwed: 21.25, amountPaid: 21.25, status: 'paid' },
                        ],
                    } as ApiSplitRecord,
                    {
                        id: "mock-3",
                        totalAmount: 200.00,
                        amountPaid: 0.00,
                        status: "active",
                        description: "Groceries",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        participants: [
                            { id: "p5", userId: "u1", amountOwed: 100, amountPaid: 0, status: 'pending' },
                            { id: "p6", userId: "u2", amountOwed: 100, amountPaid: 0, status: 'pending' },
                        ],
                    } as ApiSplitRecord,
                ];
            }
            const response = await apiClient.get<ApiSplitRecord[]>(ApiRoutes.splits.list(), { signal });
            return response.data;
        },
        []
    );
}
