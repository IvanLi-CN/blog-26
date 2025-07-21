import { ContentCacheLogger } from '~/components/content-cache/ContentCacheLogger';
import { TRPCProvider } from '~/components/TRPCProvider';

export default function ContentCacheView() {
  return (
    <TRPCProvider>
      <ContentCacheLogger />
    </TRPCProvider>
  );
}
