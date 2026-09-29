# eve-gm-alert

Watches your live EVE Online chat log (default: Rookie Help) and sounds a loud looping siren the moment a GM (or CCP) speaker posts. Windows + Node.js.

## Use
    start.bat                 # watch "Rookie Help"
    start.bat Local           # watch another channel
    start.bat --isd           # also alarm on ISD volunteers

Press any key to silence the alarm, Ctrl+C to quit. Chat logging must be enabled in EVE; logs are read from `Documents\EVE\logs\Chatlogs`.
