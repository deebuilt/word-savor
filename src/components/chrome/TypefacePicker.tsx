import { TYPEFACES, type TypefaceId } from '../../design/typefaces'
import styles from './TypefacePicker.module.css'

/**
 * One of the two face settings.
 *
 * Each option previews itself — the name is set in the face it names, and the
 * sample below it in the same. A list of font names set in one font tells you
 * nothing, and this setting exists partly for readers who need to *see* which
 * one works for them rather than recognise it by name.
 *
 * A radio group rather than a Select: four options is few enough to show at
 * once, and a dropdown would hide the previews behind a tap, which defeats the
 * point of previewing.
 */

interface TypefacePickerProps {
  /** What this picker sets — the word face or the body face. */
  label: string
  /** One line on what the choice affects. */
  hint: string
  value: TypefaceId
  onChange: (id: TypefaceId) => void
  /**
   * The sample text, so the word picker can preview an actual word and the body
   * picker a phrase — the two are read very differently.
   */
  sample: string
  /** Preview the sample at display size, for the word face. */
  large?: boolean
  /** Distinguishes the two radio groups when both are on screen. */
  name: string
}

export function TypefacePicker({
  label,
  hint,
  value,
  onChange,
  sample,
  large = false,
  name,
}: TypefacePickerProps) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <p className={styles.hint}>{hint}</p>

      <div className={styles.options}>
        {TYPEFACES.map((face) => {
          const selected = face.id === value
          return (
            <label
              key={face.id}
              className={[styles.option, selected ? styles.selected : '']
                .filter(Boolean)
                .join(' ')}
            >
              {/* A real radio input, visually hidden rather than removed: it
                  keeps arrow-key navigation, the focus ring, and the label
                  association that a div with a click handler would all lose. */}
              <input
                type="radio"
                name={name}
                value={face.id}
                checked={selected}
                onChange={() => onChange(face.id)}
                className={styles.input}
              />

              <span
                className={[styles.sample, large ? styles.sampleLarge : '']
                  .filter(Boolean)
                  .join(' ')}
                /* The preview is the point: each option renders in the face it
                   offers, at that face's own optical scale, so the list shows
                   the real relative sizes rather than four different faces
                   pretending to be one size. */
                style={{
                  fontFamily: face.stack,
                  fontSize: `calc(${large ? '30px' : '15px'} * ${face.scale})`,
                  lineHeight: face.leading * 1.3,
                  fontWeight: face.mediumWeight,
                }}
              >
                {sample}
              </span>

              <span className={styles.meta}>
                <span className={styles.name} style={{ fontFamily: face.stack }}>
                  {face.name}
                </span>
                <span className={styles.voice}>{face.voice}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
