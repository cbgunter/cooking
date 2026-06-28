import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env["VITE_COGNITO_USER_POOL_ID"] as string,
  ClientId: import.meta.env["VITE_COGNITO_CLIENT_ID"] as string,
});

const TOKEN_KEY = "cooking-id-token";
const EXPIRES_KEY = "cooking-token-expires";

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!token || !expires) return null;
  if (Date.now() > Number(expires)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    return null;
  }
  return token;
}

export async function signIn(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const details = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(details, {
      onSuccess: (session) => {
        const idToken = session.getIdToken();
        localStorage.setItem(TOKEN_KEY, idToken.getJwtToken());
        localStorage.setItem(EXPIRES_KEY, String(idToken.getExpiration() * 1000));
        resolve();
      },
      onFailure: reject,
    });
  });
}

export function getCurrentUserEmail(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as Record<string, unknown>)["email"] as string ?? null;
  } catch {
    return null;
  }
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}
