'use client';

import type { Role } from '@prisma/client';
import * as React from 'react';

export interface SessionUserView {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

const SessionUserContext = React.createContext<SessionUserView | null>(null);

export function SessionUserProvider({
  user,
  children,
}: {
  user: SessionUserView;
  children: React.ReactNode;
}) {
  return <SessionUserContext.Provider value={user}>{children}</SessionUserContext.Provider>;
}

export function useSessionUser(): SessionUserView | null {
  return React.useContext(SessionUserContext);
}
