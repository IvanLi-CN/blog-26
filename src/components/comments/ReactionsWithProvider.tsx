import { TRPCProvider } from '../TRPCProvider';
import Reactions from './Reactions';
import type { UserInfo } from './types';

interface ReactionsWithProviderProps {
  targetType: 'post' | 'comment';
  targetId: string;
  userInfo: UserInfo | null;
}

export default function ReactionsWithProvider(props: ReactionsWithProviderProps) {
  return (
    <TRPCProvider>
      <Reactions {...props} />
    </TRPCProvider>
  );
}
