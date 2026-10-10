import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page } from '@/components/layout';

function Instruction({ step, text }: { step: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {step}
      </div>
      <span className="text-sm">{text}</span>
    </div>
  );
}

export default function EmailVerificationScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? '';

  return (
    <Page className="flex min-h-screen flex-col justify-center">
      <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <MailCheck className="h-10 w-10" />
      </div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">Verify your email</h1>
      <p className="mt-3 text-center text-muted-foreground">We have sent a verification link to</p>
      <p className="mt-1 text-center font-medium">{email || 'your inbox'}</p>
      <Card className="mt-6">
        <CardContent className="grid gap-3 pt-6">
          <Instruction step="1" text="Open your email inbox" />
          <Instruction step="2" text="Click the verification link in the email from Incoin" />
          <Instruction step="3" text="Come back here and login" />
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Didn&apos;t receive the email? Check your spam folder.
      </p>
      <Button size="lg" className="mt-8 w-full" onClick={() => navigate('/login')}>
        <LogIn className="h-4 w-4" />
        Go to Login
      </Button>
    </Page>
  );
}
