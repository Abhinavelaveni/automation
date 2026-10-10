export type ServiceId = 'incoin' | 'pakkago';

export interface ServiceMeta {
  id: ServiceId;
  name: string;
  title: string;
  subtitle: string;
  connectTitle: string;
  connectHint: string;
}

export const SERVICES: ServiceMeta[] = [
  {
    id: 'incoin',
    name: 'Incoin',
    title: 'Incoin Auto',
    subtitle: 'Process Incoin workspace tasks with your saved session',
    connectTitle: 'Sign in to Incoin',
    connectHint: 'Enter your Incoin credentials to connect this workspace.',
  },
  {
    id: 'pakkago',
    name: 'PakkaGo',
    title: 'PakkaGo',
    subtitle: 'Process PakkaGo workspace tasks with your saved session',
    connectTitle: 'Sign in to PakkaGo',
    connectHint: 'Enter your PakkaGo credentials to connect this workspace.',
  },
];

export function isServiceId(value: unknown): value is ServiceId {
  return value === 'incoin' || value === 'pakkago';
}

export function serviceMeta(id?: string | null): ServiceMeta {
  return SERVICES.find((s) => s.id === id) || SERVICES[0];
}
