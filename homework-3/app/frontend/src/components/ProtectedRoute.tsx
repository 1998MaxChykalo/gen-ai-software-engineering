import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { authStore } from "../api";
import { AppShell } from "./AppShell";

interface ProtectedRouteProps {
  children: ReactElement;
}

/** Redirects to /login when no access token is stored; otherwise wraps the page in the app shell. */
export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  if (!authStore.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell>{children}</AppShell>;
}
