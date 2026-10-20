import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { SessionResponse } from '/src/config/api'

interface AccountStore {
  /** Session of the user logged in to this instance */
  session?: SessionResponse

  setSession: (session: SessionResponse) => void
  clearSession: () => void
}

const useAccountStore = create<AccountStore>()(persist(
  set => ({
    session: undefined,

    setSession: session => set({ session }),
    clearSession: () => set({ session: undefined }),
  }),
  { name: 'crabfit-account' },
))

export default useAccountStore
