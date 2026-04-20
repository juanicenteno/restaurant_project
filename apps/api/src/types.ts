import type { auth } from "./auth.js";

type Session = typeof auth.$Infer.Session.user;

export type AppVariables = {
  user: Session;
  restaurantId: string;
};