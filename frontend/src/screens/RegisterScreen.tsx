import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Phone, UserPlus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppHeader, BackButton, Page } from '@/components/layout';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/toast';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/storage';

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

export default function RegisterScreen() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<string>('');
  const [incoinAccount, setIncoinAccount] = useState('');
  const [loading, setLoading] = useState(false);

  const validateAccount = (account: string): boolean => /^(\+91|91)?[6-9]\d{9}$/.test(account);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !name.trim() || !password || !state || !incoinAccount.trim()) {
      showToast('Please fill all required fields including Name, State, and Incoin Account Username / ID.');
      return;
    }
    if (!validateAccount(incoinAccount.trim())) {
      showToast('Invalid Incoin account number. Use Indian mobile format (e.g., +91XXXXXXXXXX or 10 digits)');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const deviceId = getDeviceId();
      const alreadyRegistered = await api.isDeviceRegistered(deviceId);
      if (alreadyRegistered) {
        showToast('An account has already been created on this device. Only one account per device is allowed.');
        return;
      }

      await register({
        email: email.trim(),
        password,
        fullName: name.trim(),
        state,
        incoinUsername: incoinAccount.trim(),
      });
      await api.registerDevice(deviceId);

      showToast('Account created! Please verify your email to continue.', 'success');
      navigate('/verify-email', { state: { email: email.trim() } });
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader leading={<BackButton to="/login" />} />
      <Page>
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">Create account</CardTitle>
            <CardDescription>Get 25 free credits on signup.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              <Field
                label="Gmail / Email *"
                icon={<Mail className="h-4 w-4" />}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <Field
                label="Full Name *"
                icon={<User className="h-4 w-4" />}
                placeholder="Enter your full name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
              <Field
                label="Password *"
                icon={<Lock className="h-4 w-4" />}
                type="password"
                placeholder="Create a strong password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <Field
                label="Confirm Password *"
                icon={<Lock className="h-4 w-4" />}
                type="password"
                placeholder="Retype your password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              <div className="grid gap-2">
                <Label>Select State *</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="Incoin Account Username / ID *"
                icon={<Phone className="h-4 w-4" />}
                type="tel"
                placeholder="e.g. 9875641235"
                value={incoinAccount}
                onChange={setIncoinAccount}
              />
              <p className="text-xs text-muted-foreground">
                Your Incoin account and its phone number will be permanently bound to this Gmail account
                and cannot be registered with any other email.
              </p>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                <UserPlus className="h-4 w-4" />
                Create account
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Button variant="link" className="h-auto px-0" onClick={() => navigate('/login')}>
                Login
              </Button>
            </p>
          </CardContent>
        </Card>
      </Page>
    </>
  );
}
