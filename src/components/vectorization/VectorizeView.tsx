import { TRPCProvider } from '~/components/TRPCProvider';
import { VectorizationLogger } from '~/components/vectorization/VectorizationLogger';

export default function VectorizeView() {
  return (
    <TRPCProvider>
      <VectorizationLogger />
    </TRPCProvider>
  );
}
