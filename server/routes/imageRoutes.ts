import { Router } from 'express';
import { uploadImage, getImage, deleteImage } from '../controllers/imageController';

const router = Router();

router.post('/', uploadImage);
router.get('/:id', getImage);
router.delete('/:id', deleteImage);

export default router;
