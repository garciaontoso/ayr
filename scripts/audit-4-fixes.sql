-- audit-4-fixes.sql — RISKY changes for review (NOT auto-applied)
-- Generated 2026-05-02 by scripts/audit_4_ib_deep_2026-05-02.py

-- ============================================
-- A) Field mismatches (same exec_id different fields)
-- Decision: usually CSV wins (it's the broker source of truth).
-- Review each one — if D1 was hand-corrected, keep D1.
-- ============================================

-- d1_id=3764 exec_id=1766390438/15474262319 fecha=2021-02-23 ticker=ARKG
-- D1: shares=5.0 precio=98.436 coste=-492.18
-- CSV: shares=5.0 precio=98.44 coste=-492.184
-- UPDATE cost_basis SET shares=5.0, precio=98.44, coste=-492.184 WHERE id=3764;

-- d1_id=3769 exec_id=1773545922/15517146489 fecha=2021-02-25 ticker=ARKG
-- D1: shares=30.0 precio=92.045 coste=-2761.35
-- CSV: shares=30.0 precio=92.035 coste=-2761.34625725
-- UPDATE cost_basis SET shares=30.0, precio=92.035, coste=-2761.34625725 WHERE id=3769;

-- d1_id=4150 exec_id=2195815438/18721648313 fecha=2021-12-09 ticker=CIK
-- D1: shares=100.0 precio=3.4387 coste=-343.87
-- CSV: shares=100.0 precio=3.435 coste=-343.87025725
-- UPDATE cost_basis SET shares=100.0, precio=3.435, coste=-343.87025725 WHERE id=4150;

-- d1_id=4864 exec_id=2195830026/18721725797 fecha=2021-12-09 ticker=IGR
-- D1: shares=100.0 precio=9.3517 coste=-935.17
-- CSV: shares=100.0 precio=9.345 coste=-935.17025725
-- UPDATE cost_basis SET shares=100.0, precio=9.345, coste=-935.17025725 WHERE id=4864;

-- d1_id=5530 exec_id=1766734209/15474964664 fecha=2021-02-23 ticker=NIO
-- D1: shares=24.0 precio=47.263333 coste=-1134.32
-- CSV: shares=24.0 precio=47.26 coste=-1134.3168
-- UPDATE cost_basis SET shares=24.0, precio=47.26, coste=-1134.3168 WHERE id=5530;

-- d1_id=5531 exec_id=1766734209/15474964692 fecha=2021-02-23 ticker=NIO
-- D1: shares=1.0 precio=47.22 coste=-47.22
-- CSV: shares=1.0 precio=47.225 coste=-47.2238
-- UPDATE cost_basis SET shares=1.0, precio=47.225, coste=-47.2238 WHERE id=5531;

-- d1_id=5532 exec_id=1773027914/15514819797 fecha=2021-02-25 ticker=NIO
-- D1: shares=-100.0 precio=48.5266 coste=4852.66
-- CSV: shares=-100.0 precio=48.53 coste=4852.66309245
-- UPDATE cost_basis SET shares=-100.0, precio=48.53, coste=4852.66309245 WHERE id=5532;

-- d1_id=5542 exec_id=1850327308/16037861548 fecha=2021-04-09 ticker=NIO
-- D1: shares=6.0 precio=38.398333 coste=-230.39
-- CSV: shares=6.0 precio=38.4 coste=-230.3886
-- UPDATE cost_basis SET shares=6.0, precio=38.4, coste=-230.3886 WHERE id=5542;

-- d1_id=5543 exec_id=1850327308/16037878806 fecha=2021-04-09 ticker=NIO
-- D1: shares=10.0 precio=38.398 coste=-383.98
-- CSV: shares=10.0 precio=38.4 coste=-383.981
-- UPDATE cost_basis SET shares=10.0, precio=38.4, coste=-383.981 WHERE id=5543;

-- d1_id=5544 exec_id=1850327308/16037880367 fecha=2021-04-09 ticker=NIO
-- D1: shares=23.0 precio=38.398261 coste=-883.16
-- CSV: shares=23.0 precio=38.4 coste=-883.1563
-- UPDATE cost_basis SET shares=23.0, precio=38.4, coste=-883.1563 WHERE id=5544;

-- d1_id=5720 exec_id=2195832686/18721739553 fecha=2021-12-09 ticker=OXLC
-- D1: shares=100.0 precio=7.7417 coste=-774.17
-- CSV: shares=100.0 precio=7.735 coste=-774.17025725
-- UPDATE cost_basis SET shares=100.0, precio=7.735, coste=-774.17025725 WHERE id=5720;

-- d1_id=5721 exec_id=2195908185/18722130665 fecha=2021-12-09 ticker=OXLC
-- D1: shares=100.0 precio=7.7321 coste=-773.21
-- CSV: shares=100.0 precio=7.73 coste=-773.21025725
-- UPDATE cost_basis SET shares=100.0, precio=7.73, coste=-773.21025725 WHERE id=5721;

-- d1_id=6820 exec_id=1663645226/14808345799 fecha=2021-01-06 ticker=TME
-- D1: shares=200.0 precio=20.22 coste=-4044.0
-- CSV: shares=200.0 precio=20.215 coste=-4044.0
-- UPDATE cost_basis SET shares=200.0, precio=20.215, coste=-4044.0 WHERE id=6820;

-- d1_id=6824 exec_id=1828221769/15874798264 fecha=2021-03-24 ticker=TME
-- D1: shares=-100.0 precio=24.3068 coste=2430.68
-- CSV: shares=-100.0 precio=24.31 coste=2430.67544465
-- UPDATE cost_basis SET shares=-100.0, precio=24.31, coste=2430.67544465 WHERE id=6824;

-- d1_id=4433 exec_id=2165349158/18485429184 fecha=2021-11-19 ticker=ETV
-- D1: shares=7.0 precio=16.711429 coste=-116.98
-- CSV: shares=7.0 precio=16.71 coste=-116.9777
-- UPDATE cost_basis SET shares=7.0, precio=16.71, coste=-116.9777 WHERE id=4433;

-- d1_id=4493 exec_id=2165320930/18486192698 fecha=2021-11-19 ticker=EXG
-- D1: shares=99.0 precio=10.578586 coste=-1047.28
-- CSV: shares=99.0 precio=10.575 coste=-1047.278479634
-- UPDATE cost_basis SET shares=99.0, precio=10.575, coste=-1047.278479634 WHERE id=4493;

-- d1_id=5141 exec_id=2139770057/18292570568 fecha=2021-11-04 ticker=KWEB
-- D1: shares=100.0 precio=48.0217 coste=-4802.17
-- CSV: shares=100.0 precio=48.015 coste=-4802.17025725
-- UPDATE cost_basis SET shares=100.0, precio=48.015, coste=-4802.17025725 WHERE id=5141;

-- d1_id=5145 exec_id=2148473799/18360304129 fecha=2021-11-10 ticker=KWEB
-- D1: shares=30.0 precio=48.558333 coste=-1456.75
-- CSV: shares=30.0 precio=48.56 coste=-1456.746
-- UPDATE cost_basis SET shares=30.0, precio=48.56, coste=-1456.746 WHERE id=5145;

-- d1_id=4494 exec_id=2253987593/19204136699 fecha=2022-01-24 ticker=EXG
-- D1: shares=100.0 precio=9.1216 coste=-912.16
-- CSV: shares=100.0 precio=9.12 coste=-912.16025725
-- UPDATE cost_basis SET shares=100.0, precio=9.12, coste=-912.16025725 WHERE id=4494;

-- d1_id=6339 exec_id=2293168126/19521499280 fecha=2022-02-18 ticker=RYLD
-- D1: shares=100.0 precio=23.2817 coste=-2328.17
-- CSV: shares=100.0 precio=23.275 coste=-2328.17025725
-- UPDATE cost_basis SET shares=100.0, precio=23.275, coste=-2328.17025725 WHERE id=6339;

-- d1_id=6340 exec_id=2294120664/19526272826 fecha=2022-02-18 ticker=RYLD
-- D1: shares=100.0 precio=23.1121 coste=-2311.21
-- CSV: shares=100.0 precio=23.11 coste=-2311.21025725
-- UPDATE cost_basis SET shares=100.0, precio=23.11, coste=-2311.21025725 WHERE id=6340;

-- d1_id=7167 exec_id=2259641106/19244825267 fecha=2022-01-26 ticker=YYY
-- D1: shares=15.0 precio=15.808667 coste=-237.13
-- CSV: shares=15.0 precio=15.81 coste=-237.132
-- UPDATE cost_basis SET shares=15.0, precio=15.81, coste=-237.132 WHERE id=7167;

-- d1_id=7168 exec_id=2259641106/19244879487 fecha=2022-01-26 ticker=YYY
-- D1: shares=21.0 precio=15.82381 coste=-332.3
-- CSV: shares=21.0 precio=15.825 coste=-332.2998
-- UPDATE cost_basis SET shares=21.0, precio=15.825, coste=-332.2998 WHERE id=7168;

-- d1_id=4629 exec_id=2449269104/20831998757 fecha=2022-06-16 ticker=GLO
-- D1: shares=200.0 precio=7.005 coste=-1401.0
-- CSV: shares=200.0 precio=7.0 coste=-1401.0
-- UPDATE cost_basis SET shares=200.0, precio=7.0, coste=-1401.0 WHERE id=4629;

-- d1_id=5149 exec_id=2248429533/19162971452 fecha=2022-01-20 ticker=KWEB
-- D1: shares=100.0 precio=38.9817 coste=-3898.17
-- CSV: shares=100.0 precio=38.98 coste=-3898.17025725
-- UPDATE cost_basis SET shares=100.0, precio=38.98, coste=-3898.17025725 WHERE id=5149;

-- d1_id=5150 exec_id=2318738514/19728104949 fecha=2022-03-08 ticker=KWEB
-- D1: shares=41.0 precio=28.464634 coste=-1167.05
-- CSV: shares=41.0 precio=28.455 coste=-1167.05445725
-- UPDATE cost_basis SET shares=41.0, precio=28.455, coste=-1167.05445725 WHERE id=5150;

-- d1_id=5151 exec_id=2318738514/19728104957 fecha=2022-03-08 ticker=KWEB
-- D1: shares=9.0 precio=28.456667 coste=-256.11
-- CSV: shares=9.0 precio=28.455 coste=-256.1058
-- UPDATE cost_basis SET shares=9.0, precio=28.455, coste=-256.1058 WHERE id=5151;

-- d1_id=5153 exec_id=2322143798/19758172580 fecha=2022-03-10 ticker=KWEB
-- D1: shares=17.0 precio=26.703529 coste=-453.96
-- CSV: shares=17.0 precio=26.705 coste=-453.9646
-- UPDATE cost_basis SET shares=17.0, precio=26.705, coste=-453.9646 WHERE id=5153;

-- d1_id=5046 exec_id=2836738499/24127401957 fecha=2023-06-09 ticker=JPC
-- D1: shares=100.0 precio=6.545 coste=-654.5
-- CSV: shares=100.0 precio=6.535 coste=-654.5
-- UPDATE cost_basis SET shares=100.0, precio=6.535, coste=-654.5 WHERE id=5046;

-- d1_id=5725 exec_id=2882249467/24516580870 fecha=2023-07-21 ticker=OXLC
-- D1: shares=200.0 precio=5.42 coste=-1084.0
-- CSV: shares=200.0 precio=5.415 coste=-1084.0
-- UPDATE cost_basis SET shares=200.0, precio=5.415, coste=-1084.0 WHERE id=5725;

-- d1_id=7094 exec_id=2836911555/24128413064 fecha=2023-06-09 ticker=XFLT
-- D1: shares=100.0 precio=6.565 coste=-656.5
-- CSV: shares=100.0 precio=6.555 coste=-656.5
-- UPDATE cost_basis SET shares=100.0, precio=6.555, coste=-656.5 WHERE id=7094;

-- ============================================
-- B) D1 rows with exec_id NOT in any CSV
-- DO NOT delete blindly — these may be valid trades from missing CSVs.
-- Investigation steps:
--   1. Run a fresh Flex multi-account query covering 2013-2020.
--   2. Check if exec_id format matches (IBOrderID/TransactionID vs IBExecID).
--   3. If still orphan, check broker= column or notas for source.
-- ============================================

-- id=32232 exec_id=0000e432.69f483ef.01.01 fecha=2026-05-01 ticker=CNSWF tipo=EQUITY shares=100 account=None
-- id=32233 exec_id=00031722.69f4a6ed.01.01 fecha=2026-05-01 ticker=LULU tipo=EQUITY shares=1 account=None
-- id=32234 exec_id=0000fb0a.69f4dbd7.02.01.01 fecha=2026-05-01 ticker=LULU tipo=OPTION shares=-1 account=None
-- id=32235 exec_id=0000fb0a.69f4dbd7.03.01.01 fecha=2026-05-01 ticker=LULU tipo=OPTION shares=1 account=None
-- id=32236 exec_id=0000d7a0.69f4a4d8.01.01 fecha=2026-05-01 ticker=CNSWF tipo=EQUITY shares=-1 account=None
-- id=32237 exec_id=0000d7a0.69f4a4da.01.01 fecha=2026-05-01 ticker=CNSWF tipo=EQUITY shares=-2 account=None
-- id=32238 exec_id=0000d7a0.69f4a4df.01.01 fecha=2026-05-01 ticker=CNSWF tipo=EQUITY shares=-87 account=None
-- id=32239 exec_id=00030e5e.6ccf2da8.01.01 fecha=2026-05-01 ticker=MO tipo=EQUITY shares=-100 account=None
-- id=32240 exec_id=000249e2.69f4a533.01.01 fecha=2026-05-01 ticker=ZTS tipo=EQUITY shares=50 account=None
-- id=32241 exec_id=0001de5f.69f4fd9a.01.01 fecha=2026-05-01 ticker=KWEB tipo=OPTION shares=-5 account=None

