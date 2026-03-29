import { createContext, useContext } from 'react';
const HomeContext = createContext();
export const useHome = () => useContext(HomeContext);
export default HomeContext;
