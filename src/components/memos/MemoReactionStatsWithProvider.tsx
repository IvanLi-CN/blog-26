import { TRPCProvider } from '../TRPCProvider';
import MemoReactionStats from './MemoReactionStats';

interface MemoReactionStatsWithProviderProps {
  memoSlug: string;
}

export default function MemoReactionStatsWithProvider(props: MemoReactionStatsWithProviderProps) {
  return (
    <TRPCProvider>
      <MemoReactionStats {...props} />
    </TRPCProvider>
  );
}
