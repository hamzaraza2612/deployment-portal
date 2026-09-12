import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import userRoutes from './routes/users.routes';
import serverRoutes from './routes/servers.routes';
import applicationRoutes from './routes/applications.routes';
import environmentRoutes from './routes/environments.routes';
import credentialRoutes from './routes/credentials.routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/environments', environmentRoutes);
app.use('/api/credentials', credentialRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Deployment portal API listening on port ${env.port}`);
});
