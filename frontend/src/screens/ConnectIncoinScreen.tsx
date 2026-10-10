import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Link2, Loader2, Lock, RefreshCw, Shield, UserPlus } from 'lucide-react';
import { AppHeader, BackButton, Page } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { useToast } from '@/context/toast';
import { getActiveProvider } from '@/lib/storage';
import { serviceMeta } from '@/lib/services';

export default function ConnectIncoinScreen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const provider = getActiveProvider() || 'incoin';
  const meta = serviceMeta(provider);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaBase64, setCaptchaBase64] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState('');
  const [workspaceConnected, setWorkspaceConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError(null);
    setCaptchaBase64(null);
    setCaptcha('');
    try {
      const result = await api.fetchCaptcha(provider);
      setCaptchaBase64(`data:image/png;base64,${result.imageBase64}`);
      setCaptchaToken(result.captchaToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setCaptchaError(message || 'Could not load the verification image. Check the server logs and try again.');
    } finally {
      setCaptchaLoading(false);
    }
  }, [provider]);

  const loadState = useCallback(() => {
    api.getEngineState(provider).then((s) => {
      setSavedUsername(s.username || '');
      setWorkspaceConnected(s.connected);
      setUsername((prev) => prev || s.username || '');
    });
  }, [provider]);

  useEffect(() => {
    loadState();
    fetchCaptcha();
  }, [fetchCaptcha, loadState]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) {
      showToast('Please enter username and password.');
      return;
    }
    if (!captcha.trim()) {
      showToast('Please enter the captcha code.');
      return;
    }
    setLoading(true);
    setLoginError(null);
    const result = await api.connectIncoin({
      username: username.trim(),
      password,
      captchaCode: captcha.trim(),
      captchaToken,
      provider,
    });
    setLoading(false);
    if (!result.success) {
      setLoginError(result.error || 'Could not sign in to the service. Please check your credentials and try again.');
      fetchCaptcha();
      return;
    }
    showToast('Service account integrated successfully!', 'success');
    loadState();
    navigate('/dashboard');
  };

  return (
    <>
      <AppHeader
        title={`${meta.name} Integration`}
        leading={<BackButton to={workspaceConnected ? '/dashboard' : '/select-service'} />}
      />
      <Page>
        <div className="mb-6 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{meta.connectTitle}</h2>
          <p className="text-muted-foreground">{meta.connectHint}</p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Your credentials are used only to authenticate with your service account and are stored encrypted
            on the server. Each email may connect one {meta.name} account.
          </AlertDescription>
        </Alert>

        <form className="grid gap-4" onSubmit={submit}>
          <Field
            label="Account Username / ID"
            icon={<UserPlus className="h-4 w-4" />}
            placeholder={savedUsername ? 'Permanently bound to your account' : 'Enter your service username'}
            value={username}
            onChange={setUsername}
            disabled={!!savedUsername}
          />
          {savedUsername && (
            <p className="text-xs text-muted-foreground">
              This {meta.name} account is permanently bound to your registered Gmail and cannot be changed.
            </p>
          )}
          <Field
            label="Account Password"
            icon={<Lock className="h-4 w-4" />}
            type="password"
            placeholder="Enter your service password"
            value={password}
            onChange={setPassword}
          />

          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium">Captcha verification</h3>
            <Card>
              <CardContent className="flex h-20 items-stretch p-0">
                <div className="flex flex-1 items-center justify-center">
                  {captchaLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : captchaError ? (
                    <span className="px-3 text-center text-xs text-muted-foreground">{captchaError}</span>
                  ) : captchaBase64 ? (
                    <img src={captchaBase64} alt="Captcha" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Loading captcha...</span>
                  )}
                </div>
                <div className="flex w-14 items-center justify-center border-l">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={fetchCaptcha}
                    disabled={captchaLoading}
                    aria-label="Refresh captcha"
                  >
                    {captchaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Field
            label="Enter Captcha"
            icon={<Shield className="h-4 w-4" />}
            placeholder="Type the code shown above"
            value={captcha}
            onChange={setCaptcha}
          />

          {loginError && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            <Link2 className="h-4 w-4" />
            Verify & Integrate
          </Button>
        </form>
      </Page>
    </>
  );
}
