declare global {
  interface ImportMetaEnv {
    readonly VITE_IFF_VERCEL?: string;
  }
}

const onVercel = import.meta.env.VITE_IFF_VERCEL === '1';
export const maxResumeMb = onVercel ? 4 : 5;
export const maxMediaMb = onVercel ? 4 : 20;
export const maxResumeBytes = maxResumeMb * 1024 * 1024;
export const maxMediaBytes = maxMediaMb * 1024 * 1024;
