import { TRPCProvider } from '../TRPCProvider';
import CommentSection from './CommentSection';

interface CommentSectionWithProviderProps {
  postSlug: string;
  title?: string;
  texts?: Partial<{
    title: string;
    submitSuccess: string;
    loadingText: string;
    loadMoreText: string;
  }>;
}

export default function CommentSectionWithProvider(props: CommentSectionWithProviderProps) {
  return (
    <TRPCProvider>
      <CommentSection {...props} />
    </TRPCProvider>
  );
}
