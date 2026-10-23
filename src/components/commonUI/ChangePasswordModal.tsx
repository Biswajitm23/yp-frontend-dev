"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { CustomModal } from "../modals/CustomModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/services/auth.services";
import { LOGIN_TYPE_COOKIE } from "@/lib/authCookies";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Same rules as the forgot-password flow (ResetPassword.tsx).
const validatePassword = (pwd: string) => {
  if (!pwd.trim()) return "Password is required";

  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSpecial = /[@$!%*?&#^()\-_=+{}[\]|\;:'",.<>/]/.test(pwd);

  if (pwd.length < 8) return "Password must be at least 8 characters";
  if (!hasUppercase)
    return "Password must contain at least one uppercase letter";
  if (!hasLowercase)
    return "Password must contain at least one lowercase letter";
  if (!hasNumber) return "Password must contain at least one number";
  if (!hasSpecial)
    return "Password must contain at least one special character";

  return "";
};

type FieldKey = "current" | "new" | "confirm";

// "system" | "social" as recorded at login, or null when the cookie is absent
// (a login made before the cookie existed).
const readLoginType = () => {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOGIN_TYPE_COOKIE}=(system|social)`),
  );
  return match ? match[1] : null;
};

export default function ChangePasswordModal({ open, onOpenChange }: Props) {
  // Social logins (Google/LinkedIn/Apple) may have no password yet, so the
  // current password is optional for them; a system login must always supply
  // it. The login_type cookie written at login is the source of truth. Only
  // when it is missing do we fall back to next-auth's session, which is
  // populated solely by the social path.
  const { status } = useSession();
  const [loginType, setLoginType] = useState<string | null>(null);
  useEffect(() => {
    if (open) setLoginType(readLoginType());
  }, [open]);
  const isSocialLogin = loginType
    ? loginType === "social"
    : status === "authenticated";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState<Record<FieldKey, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setVisible({ current: false, new: false, confirm: false });
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const newPasswordError =
    newPassword.length > 0
      ? validatePassword(newPassword) ||
        (newPassword === currentPassword
          ? "New password must be different from current password"
          : "")
      : "";

  const confirmPasswordError =
    confirmPassword.length > 0 && confirmPassword !== newPassword
      ? "Passwords do not match"
      : "";

  const canSubmit =
    (isSocialLogin || currentPassword.length > 0) &&
    newPassword.length > 0 &&
    !newPasswordError &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword &&
    !isSubmitting;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const res = await updatePassword(currentPassword, newPassword);
      if (res.status === "ERROR") {
        toast.error(
          res.message || "Failed to update password. Please try again.",
        );
        return;
      }
      toast.success(res.message || "Password updated successfully");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Failed to update password. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (
    key: FieldKey,
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
    error?: string,
  ) => (
    <div className="space-y-2 form-input-custom">
      <Label htmlFor={`${key}Password`}>{label}</Label>
      <div className="relative">
        <Input
          id={`${key}Password`}
          name={`${key}Password`}
          type={visible[key] ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isSubmitting}
          className="pr-11"
        />
        <button
          type="button"
          aria-label={visible[key] ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
          className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
        >
          {visible[key] ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>
      {error && <p className="!text-red-500 text-sm">{error}</p>}
    </div>
  );

  return (
    <CustomModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Change Password"
      description={
        isSocialLogin
          ? "Choose a new password. Enter your current password only if you have set one."
          : "Enter your current password and choose a new one."
      }
      width="max-w-md"
      contentClassName="backdrop-blur-xl border shadow-2xl !rounded-xl bg-white border-gray-200 text-gray-900 [&_*]:text-gray-900 dark:bg-gradient-to-br dark:from-blue-600/20 dark:via-blue-500/15 dark:to-blue-700/20 dark:border-white/20 dark:text-white dark:[&_*]:text-white"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="custom_outline_gradient"
            onClick={() => handleOpenChange(false)}
            className="bg-black cursor-pointer"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="custom_background_gradient"
            onClick={() => handleSubmit()}
            className="bg-black cursor-pointer"
            disabled={!canSubmit}
          >
            {isSubmitting ? "Updating..." : "Update Password"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
        {renderField(
          "current",
          isSocialLogin ? "Current Password" : "Current Password",
          currentPassword,
          setCurrentPassword,
          "current-password",
        )}
        {renderField(
          "new",
          "New Password",
          newPassword,
          setNewPassword,
          "new-password",
          newPasswordError,
        )}
        {renderField(
          "confirm",
          "Confirm Password",
          confirmPassword,
          setConfirmPassword,
          "new-password",
          confirmPasswordError,
        )}
        {/* Hidden submit button enables Enter-key submission */}
        <button
          type="submit"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
        />
      </form>
    </CustomModal>
  );
}
