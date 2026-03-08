# Push till GitHub

Kör i terminalen från projektroten:

```bash
cd /Users/benny/Desktop/CODE/RunApp

# Stage alla ändringar
git add -A

# Commit med beskrivning
git commit -m "Web: hela appen på webben + Vercel-deploy (pacelabs.vercel.app)"

# Push till GitHub (byt ut main mot din branch om du använder annan)
git push origin main
```

Om du får fel om att du inte är på `main`:
```bash
git branch
git push origin <din-branch>
```

Om du behöver sätta upstream första gången:
```bash
git push -u origin main
```
