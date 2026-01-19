export function encryptJson(value: any) {
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: "mock_iv",
    tag: "mock_tag",
    ciphertext: JSON.stringify(value) // We'll just store it as string for the mock
  };
}

export function decryptJson(enc: any) {
  // In our mock, ciphertext is just the JSON string
  try {
    return JSON.parse(enc.ciphertext);
  } catch (e) {
    return { access_token: "mock_valid_token" };
  }
}
