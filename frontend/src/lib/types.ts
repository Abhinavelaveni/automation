export interface User {
  id: string;
  email: string;
  fullName?: string;
  state?: string;
  credits: number;
  emailConfirmedAt?: string | null;
  plan?: string;
  taskLimit?: number;
  tasksPerRun?: number;
  activeProvider?: 'incoin' | 'pakkago' | null;
  incoinUsername?: string | null;
  incoinPhone?: string | null;
  incoinAccountLocked?: boolean;
  pakkagoUsername?: string | null;
  pakkagoPhone?: string | null;
  pakkagoAccountLocked?: boolean;
  services?: ServiceSummary[];
  createdAt?: string;
}

export interface ServiceSummary {
  id: 'incoin' | 'pakkago';
  name: string;
  label: string;
  connected: boolean;
  username?: string | null;
  phone?: string | null;
  locked?: boolean;
}

export interface ProfileResponse {
  user: User;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface TaskLog {
  id: string;
  ordersCount: number;
  creditsUsed: number;
  createdAt: string;
}

export interface ReferralStatus {
  hasApplied: boolean;
}

export interface CaptchaResult {
  captchaToken: string;
  imageBase64: string;
  provider?: 'incoin' | 'pakkago';
}

export interface ConnectResult {
  success: boolean;
  error?: string;
  username?: string;
  phone?: string;
  accountLocked?: boolean;
  provider?: 'incoin' | 'pakkago';
}

export interface EngineState {
  connected: boolean;
  provider?: 'incoin' | 'pakkago';
  activeProvider?: 'incoin' | 'pakkago' | null;
  username?: string;
  phone?: string;
  accountLocked?: boolean;
  running: boolean;
  progress: number;
  status: string;
  processed: number;
  logs?: string[];
  runStatus?: 'queued' | 'running' | 'stopping' | 'completed' | 'stopped' | 'failed' | null;
  success?: boolean;
  processedTasks?: { taskId: string }[];
  taskLimit?: number;
  tasksPerRun?: number;
  services?: ServiceSummary[];
}

export interface WorkspaceSelectResult {
  success: boolean;
  provider: 'incoin' | 'pakkago';
  connected: boolean;
  username?: string | null;
  phone?: string | null;
  services?: ServiceSummary[];
}

export interface TaskResult {
  success: boolean;
  message: string;
  status?: string;
  logs: string[];
  processed: number;
  progress: number;
  processedTasks: { taskId: string }[];
  runId?: string;
  done?: boolean;
}
