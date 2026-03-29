import { createContext, useContext } from 'react';
const CostBasisContext = createContext();
export const useCostBasis = () => useContext(CostBasisContext);
export default CostBasisContext;
