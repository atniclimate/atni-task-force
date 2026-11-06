# Field Protocol: Testing a Machine With a Plug Meter

A local server's energy use rests mostly on one question: how much power does it draw while it waits? The Resource Use Explorer answers that question with published figures from other people's machines, and no published figure covers the idle term as it applies to a Nation's own hardware. A plug meter on the actual box replaces that assumption with a reading.

This protocol serves Tribal IT staff, energy staff, and independent researchers who want to test the model against a machine they control. The reading belongs to whoever took it. **The public site receives nothing, and any release is that Nation's decision.**

## What It Takes

- A wall meter or smart plug that reads watts, with its accuracy stated by its maker. A plug that logs through a vendor's app sends the readings to that vendor, so use one that logs locally, or write the readings down by hand.
- The machine on its own outlet, with nothing else on the meter.
- A way to read utilization while the meter runs, such as `nvidia-smi` on a machine with a graphics processor, `powermetrics` on a Mac, or the operating system's own load figures. For a server with a known workload, the share of its full throughput works too.
- Python, to run the fit. No packages are needed.

## Taking the Readings

**The load test.** Let the machine settle at idle, then record its average watts. Run the service at about 10, 30, 50, and 100 percent of its throughput, long enough at each step for the watts to steady, and record the average watts and the utilization at each. This fits the idle fraction `a`, the share of full power a machine draws when it does nothing.

**The ordinary week.** Leave the meter on for one week of the machine's normal use, and log watts and utilization at whatever interval the tools allow. This sets `U`, the share of full capacity in use.

Put both in one comma-separated values (CSV) file. The load test rows carry `sweep` in the phase column and the week's rows carry `log`, and once one row has a phase every row needs one, or the script refuses the file and names the line; `seconds` says how long each reading lasted. These rows show the format only and are not a measurement:

```text
utilization,watts,seconds,phase
0,30.4,600,sweep
0.5,115,600,sweep
1,199.8,600,sweep
0.1,47.1,10800,log
```

## What to Record

Write these down beside the file, because a reading without them cannot be checked later: the date (MM/DD/YYYY); the machine's make, model, and age; its drives, and whether they spin or sleep; what it was running; the meter's make, model, and stated accuracy, which is often weakest at low watts; the tool behind the utilization figure and what that tool counts; and whether anything else shared the meter or the room's cooling changed.

## What the Meter Sees

A plug meter sees the box at the wall, power supply included. It does not see the room's cooling, which the model carries as power usage effectiveness (PUE); the router or the link; the far end of any connection; or the energy and materials that went into making the machine. A chip tool reads the chip, not the wall: `nvidia-smi` reports the graphics processor alone, so hold its figures apart from the plug's.

Each reading stands in for a named input in the model:

| Reading | Input it replaces |
|---|---|
| Idle watts, AI node | `node_w` |
| Average watts over the ordinary week, office server | `office_w` |
| Idle watts, network-attached storage box | `nas_w` |
| Idle watts, media box | `mini_w` |
| Idle fraction, from the load test | `a_idle` |
| Utilization, from the ordinary week | `u_room` |
| Room cooling, if metered apart from the box | `pue_room` |

## Fitting the Idle Term

```powershell
python scripts\fit_idle.py readings.csv --compare node_w
```

The script fits a straight line from idle to full load and prints the idle watts, the full-load watts, `a`, `U`, and what they do to the model's energy per unit of work, each with its error and beside the model's default. `--compare` names which default to read beside this machine's figure. For `node_w`, `nas_w`, or `mini_w` that figure is the idle watts. For `office_w` it is the average watts over the ordinary week, because the model counts the office server's whole year at that one draw; an idle reading typed there would understate the year. It warns when no reading sits within 10 percent of idle or of full load, and then marks the idle watts, the full-load watts, and `a` as extrapolated past the readings; it also warns when the straight line fits this machine poorly.

To see what a reading does to the answer, type it into the Explorer's measured field for that input. Every row it moves carries the label **your measurement, not verified by ATNI**, and that label stays with the row through Copy Reading, print, and CSV. A typed value stays out of the page's address, so a shared link cannot carry it, and the page has no way to write it to the claims record.

## What This Cannot Show

One device's readings do not generalize. They describe this box, on these days, running this work; they say nothing of another machine, a fleet, or a Nation's other sites, and the script prints that limit beside every result.

A week is not a year, and the model's `U` is a year's average. The standard errors assume independent readings on a straight line, so serial dependence between readings, meter error, a machine whose curve the line does not follow, and a small number of readings all make them read low. A straight line is a simplification of how a machine draws power, and a machine may not follow it.

Watts are not answers. A small model on a quiet box can draw less and answer less, and this test measures only the first. It also says nothing about the cloud's side of a comparison, which stays a modeled figure from published sources, and nothing about custody, consent, or whether a Nation should host a facility. Those questions belong to the Nation.

## Who Holds the Readings

A meter log can show when an office works and what it runs, so it is the Nation's data from the moment it exists. This script reads a local file and sends nothing anywhere. The public site has no form, no upload, and no account, so it receives nothing. Any release of a figure, and the wording of that release, is that Nation's decision.
