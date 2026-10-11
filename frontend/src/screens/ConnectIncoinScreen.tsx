import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Link2, Loader2, Lock, RefreshCw, Shield, UserPlus, AlertCircle } from 'lucide-react';
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
  const [retryCount, setRetryCount] = useState(0);
  const [savedUsername, setSavedUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const fetchCaptcha = useCallback(async (isRetry = false) => {
    setCaptchaLoading(true);
    setCaptchaError(null);
    if (!isRetry) {
      setCaptchaBase64(null);
      setCaptcha('');
    }

    const maxRetries = 3;
    const currentRetry = isRetry ? retryCount + 1 : 1;

    console.log(`[ConnectIncoin] Fetching CAPTCHA (attempt ${currentRetry}/${maxRetries})`);

    try {
      const result = await api.fetchCaptcha(provider);
      setCaptchaBase64(`data:image/png;base64,${result.imageBase64}`);
      setCaptchaToken(result.captchaToken);
      setRetryCount(0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Could not load the verification image.';

      // Check for specific error types
      if (errorMsg.includes('CAPTCHA token') || errorMsg.includes('token header')) {
        console.error('[ConnectIncoin] CAPTCHA token header missing - possible CORS issue');
      }

      if (currentRetry < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, currentRetry - 1) * 1000;
        console.log(`[ConnectIncoin] Retrying in ${delay}ms...`);
        setTimeout(() => fetchCaptcha(true), delay);
        return;
      }

      setRetryCount(0);
      setCaptchaError(errorMsg);
    } finally {
      setCaptchaLoading(false);
    }
  }, [provider, retryCount]);

  const loadState = useCallback(() => {
    api.getEngineState(provider).then((s) => {
      setSavedUsername(s.username || '');
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
    if (!captchaToken) {
      showToast('CAPTCHA not loaded. Please wait or refresh.');
      return;
    }
    setLoading(true);
    setLoginError(null);
    console.log('[ConnectIncoin] Submitting login for:', username.trim());

    const result = await api.connectIncoin({
      username: username.trim(),
      password,
      captchaCode: captcha.trim(),
      captchaToken,
      provider,
    });

    setLoading(false);

    if (!result.success) {
      const errorMsg = result.error || 'Could not sign in. Please check credentials and try again.';
      console.error('[ConnectIncoin] Login failed:', errorMsg);
      setLoginError(errorMsg);
      // Refresh CAPTCHA after failed login attempt
      fetchCaptcha();
      return;
    }

    console.log('[ConnectIncoin] Login successful');
    showToast('Service account integrated successfully!', 'success');
    loadState();
    navigate('/dashboard');
  };

  return (
    <>
      <AppHeader
        title={`${meta.name} Integration`}
        leading={<BackButton to={savedUsername ? '/dashboard' : '/select-service'} />}
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
                    <div className="flex flex-col items-center gap-1">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Loading...</span>
                    </div>
                  ) : captchaError ? (
                    <div className="flex flex-col items-center gap-1 px-3 text-center">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs text-destructive">{captchaError}</span>
                    </div>
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
                    onClick={() => fetchCaptcha(true)}
                    disabled={captchaLoading}
                    aria-label="Refresh captcha"
                    title="Refresh captcha"
                  >
                    {captchaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
            {captchaError && (
              <p className="text-xs text-muted-foreground">
                Having trouble? Check browser console (F12) for details, or try refreshing the page.
              </p>
            )}
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
