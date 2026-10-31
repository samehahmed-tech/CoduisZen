import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('image asset privacy contract', () => {
    it('does not expose global image metadata or storage URLs publicly', () => {
        const source = fs.readFileSync('server/routes/imageRoutes.ts', 'utf8');
        expect(source).toContain("router.get('/:id', authenticateToken, imageAdmin, getImage)");
        expect(source).not.toContain("router.get('/:id', getImage)");
    });

    it('restricts global image mutations to head-office asset administrators', () => {
        const source = fs.readFileSync('server/routes/imageRoutes.ts', 'utf8');
        expect(source).toContain("const imageAdmin = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT')");
        expect(source).toContain("router.post('/', authenticateToken, imageAdmin, uploadImage)");
        expect(source).toContain("router.delete('/:id', authenticateToken, imageAdmin, deleteImage)");
    });
});
