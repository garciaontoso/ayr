import { createContext, useContext } from 'react';
const AnalysisContext = createContext();
export const useAnalysis = () => useContext(AnalysisContext);
export default AnalysisContext;
