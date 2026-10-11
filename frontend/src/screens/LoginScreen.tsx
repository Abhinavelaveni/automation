import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, LogIn, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { AppHeader, Page, ThemeToggle } from '@/components/layout';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/toast';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      showToast('Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      if (user && !user.emailConfirmedAt) {
        navigate('/verify-email', { state: { email: email.trim() } });
        return;
      }
      navigate('/select-service', { replace: true });
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader trailing={<ThemeToggle />} />
      <Page>
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in, then choose Incoin or PakkaGo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submit}>
              <Field
                label="Gmail / Email"
                icon={<Mail className="h-4 w-4" />}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <Field
                label="Password"
                icon={<Lock className="h-4 w-4" />}
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => showToast('Password reset is not available yet. Please contact support.', 'info')}
                >
                  Forgot password?
                </Button>
              </div>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                <LogIn className="h-4 w-4" />
                Login
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Button variant="link" className="h-auto px-0" onClick={() => navigate('/register')}>
                Register
              </Button>
            </p>
          </CardContent>
        </Card>
      </Page>
    </>
  );
}
