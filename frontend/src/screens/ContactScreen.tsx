import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppHeader, BackButton, Page } from '@/components/layout';

const SUPPORT_EMAIL = 'support@incoin.app';

export default function ContactScreen() {
  return (
    <>
      <AppHeader title="Contact Us" leading={<BackButton to="/dashboard" />} />
      <Page>
        <Card>
          <CardHeader>
            <CardTitle>Get in touch</CardTitle>
            <CardDescription>
              Have a question or need help? Email us and our team will get back to you as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">{SUPPORT_EMAIL}</div>
                <div className="text-xs text-muted-foreground">Support inbox</div>
              </div>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => {
                window.location.href = `mailto:${SUPPORT_EMAIL}`;
              }}
            >
              <Mail className="h-4 w-4" />
              Send us an email
            </Button>
          </CardContent>
        </Card>
      </Page>
    </>
  );
}
