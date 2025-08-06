import { TRPCProvider } from '../TRPCProvider';
import type { Attachment } from './AttachmentGrid';
import { MemoDetailWithEdit } from './MemoDetailWithEdit';

interface MemoDetailWithEditProviderProps {
  memoData: {
    id: string;
    slug: string;
    title: string;
    content: string;
    body: string;
    publishDate: Date;
    updateDate?: Date;
    public: boolean;
    attachments: Attachment[];
    tags: string[];
    image?: any;
  };
  isAdmin: boolean;
}

export default function MemoDetailWithEditProvider(props: MemoDetailWithEditProviderProps) {
  return (
    <TRPCProvider>
      <MemoDetailWithEdit {...props} />
    </TRPCProvider>
  );
}
