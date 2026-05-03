import { createContext, useContext } from 'react';
const HomeContext = createContext();
// eslint-disable-next-line react-refresh/only-export-components -- standard React context pattern (provider + hook in one file)
export const useHome = () => useContext(HomeContext);
export default HomeContext;
