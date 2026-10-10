import { useState } from 'react';
import { CheckCircle2, Gift, Image as ImageIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { useToast } from '@/context/toast';

const TELEGRAM_URL = 'https://t.me/incoinpro';

function Step({
  stepNumber,
  title,
  description,
  children,
}: {
  stepNumber: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {stepNumber}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

export default function ReferralBottomSheet({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const pickImages = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) {
        setSelected(files);
        setPreviews(files.map((f) => URL.createObjectURL(f)));
      }
    };
    input.click();
  };

  const upload = async () => {
    if (selected.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < selected.length; i++) {
        const file = new File([selected[i]], `referral_${Date.now()}_${i}.jpg`, {
          type: selected[i].type || 'image/jpeg',
        });
        const url = await api.uploadReferralScreenshot(file);
        urls.push(url);
      }
      await api.submitReferralApplication(urls);
      onApplied?.();
      onClose();
      showToast('Application submitted successfully! Service credits will be added soon.', 'success');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Earn 50 Service Credits
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            Want service credits in Incoin Auto Tool?

            Follow these simple steps:
          </p>
          <Step stepNumber="1" title="Copy Telegram Link" description="Copy our Telegram channel link:">
            <Button variant="outline" onClick={() => window.open(TELEGRAM_URL, '_blank', 'noopener')}>
              <Send className="h-4 w-4" />
              Open Telegram Channel
            </Button>
          </Step>
          <Step stepNumber="2" title="Share with Friends" description="Share it with 20 friends and ask them to join" />
          <Step stepNumber="3" title="Take Screenshots" description="Take screenshots after they join (like these examples):">
            <div className="flex gap-2 overflow-x-auto">
              {['/referral-example.jpg', '/referral-example.jpg', '/referral-example.jpg'].map((src, i) => (
                <img key={i} src={src} alt="Referral example" className="h-28 w-20 shrink-0 rounded-md object-cover" />
              ))}
            </div>
          </Step>
          <Step stepNumber="4" title="Upload Screenshots" description="Upload the screenshots in the app" />

          {selected.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">Selected Previews</div>
              <div className="flex gap-2 overflow-x-auto">
                {previews.map((src, i) => (
                  <img key={i} src={src} alt="Selected" className="h-28 w-20 rounded-md object-cover" />
                ))}
              </div>
            </div>
          )}

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              After verification, you will receive 50 Service Credits within 24 hours.
            </AlertDescription>
          </Alert>

          {selected.length === 0 ? (
            <Button size="lg" variant="outline" className="w-full" onClick={pickImages}>
              <ImageIcon className="h-4 w-4" />
              Pick Screenshots
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSelected([]);
                  setPreviews([]);
                }}
                disabled={uploading}
              >
                Clear
              </Button>
              <Button size="lg" className="flex-[2]" loading={uploading} onClick={upload}>
                {uploading ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
