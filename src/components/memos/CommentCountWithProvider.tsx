import { TRPCProvider } from '../TRPCProvider';
import { CommentCount } from './CommentCount';

interface CommentCountWithProviderProps {
  slug: string;
  className?: string;
}

export default function CommentCountWithProvider(props: CommentCountWithProviderProps) {
  return (
    <TRPCProvider>
      <CommentCount {...props} />
    </TRPCProvider>
  );
}
