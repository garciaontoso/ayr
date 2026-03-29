import { fC } from '../../utils/formatters.js';

const SensitivityTable = ({dcfFn, baseGrowth, baseDiscount}) => {
  const growths = [baseGrowth-2, baseGrowth-1, baseGrowth, baseGrowth+1, baseGrowth+2];
  const discounts = [baseDiscount-2, baseDiscount-1, baseDiscount, baseDiscount+1, baseDiscount+2];
  return (
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"var(--fm)"}}>
      <thead>
        <tr>
          <th style={{padding:6,color:"var(--text-secondary)",fontSize:9,borderBottom:"1px solid #2d3748"}}>Crec&#8595; / Desc&#8594;</th>
          {discounts.map(d=><th key={d} style={{padding:6,color:d===baseDiscount?"var(--gold)":"var(--text-secondary)",fontSize:10,borderBottom:"1px solid #2d3748",fontWeight:d===baseDiscount?700:400}}>{d}%</th>)}
        </tr>
      </thead>
      <tbody>
        {growths.map(g=>(
          <tr key={g}>
            <td style={{padding:6,color:g===baseGrowth?"var(--gold)":"var(--text-secondary)",fontWeight:g===baseGrowth?700:400,fontSize:10}}>{g}%</td>
            {discounts.map(d=>{
              const v = dcfFn(g/100, d/100);
              const isBase = g===baseGrowth && d===baseDiscount;
              return <td key={d} style={{padding:6,textAlign:"center",color:isBase?"var(--gold)":"var(--text-secondary)",fontWeight:isBase?700:400,background:isBase?"var(--gold-glow)":"transparent",borderRadius:isBase?6:0}}>{fC(v)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default SensitivityTable;
