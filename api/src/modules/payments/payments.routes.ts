/**
 * payments.routes.ts
 *
 * Route definitions only — no business logic.
 */
import { Router } from 'express';
import { paymentsController } from './payments.controller';

const router = Router();

// Payment CRUD
router.post('/', paymentsController.createPayment);
router.get('/', paymentsController.listPayments);
router.get('/stats', paymentsController.getStats);
router.get('/:id', paymentsController.getPayment);

// Admin/maintenance
router.post('/admin/recover', paymentsController.triggerRecovery);

export { router as paymentsRouter };
