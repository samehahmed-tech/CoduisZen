import { apiRequest } from './core';

export interface RecurringTemplate {
    id: string;
    description: string;
    amount: number;
    currency: string;
    recurringType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    nextProcessDate: string; // ISO 8601 date string
    lastProcessedDate?: string;
    isActive: boolean;
    entries: {
        accountId: string;
        type: 'DEBIT' | 'CREDIT';
        percentage: number; // For dynamic splitting, or just 100 for a fixed amount
    }[];
}

export const recurringApi = {
    getTemplates: () => 
        apiRequest<RecurringTemplate[]>('/finance/recurring', { method: 'GET' }),
        
    createTemplate: (template: Partial<RecurringTemplate>) => 
        apiRequest<RecurringTemplate>('/finance/recurring', { 
            method: 'POST', 
            body: JSON.stringify(template) 
        }),
        
    updateTemplate: (id: string, updates: Partial<RecurringTemplate>) => 
        apiRequest<RecurringTemplate>(`/finance/recurring/${id}`, { 
            method: 'PUT', 
            body: JSON.stringify(updates) 
        }),
        
    deleteTemplate: (id: string) => 
        apiRequest<{ ok: boolean }>(`/finance/recurring/${id}`, { method: 'DELETE' }),
        
    processDueNow: () => 
        apiRequest<{ processed: number; errors: number }>('/finance/recurring/process', { method: 'POST' }),
};
