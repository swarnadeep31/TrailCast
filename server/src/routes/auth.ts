import { Router } from 'express';
import { google, login, logout, logoutEverywhere, me, saveOnboarding, signup } from '../controllers/authController.ts';
import { requireUser } from '../middleware/auth.ts';

export const authRouter = Router();

authRouter.post('/signup', signup);
authRouter.post('/login', login);
authRouter.post('/google', google);
authRouter.post('/logout', logout);
authRouter.post('/logout-everywhere', requireUser, logoutEverywhere);
authRouter.get('/me', me);
authRouter.put('/onboarding', requireUser, saveOnboarding);
