
export const createSupabaseServerClient = async () => {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (col: string, val: any) => ({
          eq: (col2: string, val2: any) => ({
            single: async () => {
              // Return a mock connection with encrypted credentials
              // The integrationId is the second 'eq' value usually, but here we just return success.
              // val2 is integrationId in the call: .eq("org_id", orgId).eq("integration_id", integrationId)
              
              if (val2 === "google_expired") {
                  return {
                      data: {
                        encrypted_credentials: {
                          ciphertext: JSON.stringify({ access_token: "expired_token" })
                        }
                      },
                      error: null
                  }
              }

              if (val2 === "google_missing") {
                  return { data: null, error: { message: "Not found" } };
              }

              return {
                data: {
                  encrypted_credentials: {
                    ciphertext: JSON.stringify({ access_token: "mock_valid_token" })
                  }
                },
                error: null
              };
            }
          })
        })
      })
    })
  };
};
