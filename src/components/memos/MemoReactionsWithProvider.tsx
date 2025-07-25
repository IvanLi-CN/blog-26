import { TRPCProvider } from '../TRPCProvider';
import MemoReactions from './MemoReactions';

interface MemoReactionsWithProviderProps {
  memoSlug: string;
}

export default function MemoReactionsWithProvider(props: MemoReactionsWithProviderProps) {
  return (
    <TRPCProvider>
      <MemoReactions {...props} />
    </TRPCProvider>
  );
}
