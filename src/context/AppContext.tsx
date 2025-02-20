import React, { createContext, useContext, useReducer, ReactNode } from "react";

interface AppState {
  notifications: string[];
  theme: "light" | "dark";
  sidebarOpen: boolean;
}

type Action =
  | { type: "ADD_NOTIFICATION"; payload: string }
  | { type: "REMOVE_NOTIFICATION"; payload: number }
  | { type: "SET_THEME"; payload: "light" | "dark" }
  | { type: "SET_SIDEBAR_OPEN"; payload: boolean };

const initialState: AppState = {
  notifications: [],
  theme: "dark",
  sidebarOpen: false,
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
}>({
  state: initialState,
  dispatch: () => null,
});

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_NOTIFICATION":
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };
    case "REMOVE_NOTIFICATION":
      return {
        ...state,
        notifications: state.notifications.filter(
          (_, i) => i !== action.payload
        ),
      };
    case "SET_THEME":
      return {
        ...state,
        theme: action.payload,
      };
    case "SET_SIDEBAR_OPEN":
      return {
        ...state,
        sidebarOpen: action.payload,
      };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
