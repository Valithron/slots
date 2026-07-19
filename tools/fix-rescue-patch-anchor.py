from pathlib import Path

path = Path("tools/apply-rescue-blank-rule.py")
text = path.read_text()
text = text.replace(
    'anchor = "Mystery Free Spins are ordinary base-game spins with a zero coin cost."',
    'anchor = "Mystery Free Spins outside an Ally feature remain ordinary zero-cost base-game spins."',
)
path.write_text(text)
