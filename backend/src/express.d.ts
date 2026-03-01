declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        provider: "local" | "oidc";
      };
    }
  }
}

export {};
