import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from "../middleware/auth";
import { loginSchema } from "../validators/schemas";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      allowedEnvironments: user.allowedEnvironments,
    });
    setAuthCookie(res, token);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      allowedEnvironments: user.allowedEnvironments,
    });
  })
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
