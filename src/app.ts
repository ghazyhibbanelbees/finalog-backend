import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { accountRoutes } from './modules/account/account.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { danaRoutes } from './modules/dana/dana.routes';
import { kategoriRoutes } from './modules/kategori/kategori.routes';
import { ringkasanRoutes } from './modules/ringkasan/ringkasan.routes';
import { transaksiRoutes } from './modules/transaksi/transaksi.routes';
import { uploadsRoutes } from './modules/uploads/uploads.routes';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const api = Router();
api.use('/auth', authRoutes);
// Semua route di bawah ini wajib login.
api.use(requireAuth);
api.use(accountRoutes);
api.use('/kategori', kategoriRoutes);
api.use('/dana', danaRoutes);
api.use('/transaksi', transaksiRoutes);
api.use('/uploads', uploadsRoutes);
api.use('/ringkasan', ringkasanRoutes);
app.use('/api/v1', api);

app.use(notFoundHandler);
app.use(errorHandler);
