import { createContext, useContext, type ReactNode } from 'react';
import { services } from '../src/services';

const ServicesContext = createContext(services);

export function ServicesProvider({ children }: { children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  return useContext(ServicesContext);
}
