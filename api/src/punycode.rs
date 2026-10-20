//! Punycode encoding as specified in [RFC 3492](https://www.rfc-editor.org/rfc/rfc3492)

const BASE: u32 = 36;
const T_MIN: u32 = 1;
const T_MAX: u32 = 26;
const SKEW: u32 = 38;
const DAMP: u32 = 700;
const INITIAL_BIAS: u32 = 72;
const INITIAL_N: u32 = 128;

/// Encode a string with Punycode, returning `None` on overflow
pub fn encode(input: &str) -> Option<String> {
    let code_points: Vec<u32> = input.chars().map(u32::from).collect();

    // Copy basic code points to the output, followed by a delimiter if there were any
    let mut output: String = input.chars().filter(char::is_ascii).collect();
    let basic_count = output.len() as u32;
    if basic_count > 0 {
        output.push('-');
    }

    let mut n = INITIAL_N;
    let mut delta: u32 = 0;
    let mut bias = INITIAL_BIAS;
    let mut handled = basic_count;

    while (handled as usize) < code_points.len() {
        // The next smallest code point that hasn't been handled yet
        let m = code_points.iter().copied().filter(|&c| c >= n).min()?;
        delta = delta.checked_add((m - n).checked_mul(handled + 1)?)?;
        n = m;

        for &c in &code_points {
            if c < n {
                delta = delta.checked_add(1)?;
            }
            if c == n {
                // Encode delta as a variable-length integer
                let mut q = delta;
                let mut k = BASE;
                loop {
                    let t = if k <= bias {
                        T_MIN
                    } else if k >= bias + T_MAX {
                        T_MAX
                    } else {
                        k - bias
                    };
                    if q < t {
                        break;
                    }
                    output.push(encode_digit(t + (q - t) % (BASE - t)));
                    q = (q - t) / (BASE - t);
                    k += BASE;
                }
                output.push(encode_digit(q));
                bias = adapt(delta, handled + 1, handled == basic_count);
                delta = 0;
                handled += 1;
            }
        }

        delta = delta.checked_add(1)?;
        n = n.checked_add(1)?;
    }

    Some(output)
}

fn adapt(delta: u32, num_points: u32, first_time: bool) -> u32 {
    let mut delta = delta / if first_time { DAMP } else { 2 };
    delta += delta / num_points;
    let mut k = 0;
    while delta > ((BASE - T_MIN) * T_MAX) / 2 {
        delta /= BASE - T_MIN;
        k += BASE;
    }
    k + (BASE - T_MIN + 1) * delta / (delta + SKEW)
}

fn encode_digit(digit: u32) -> char {
    match digit {
        0..=25 => (b'a' + digit as u8) as char,
        _ => (b'0' + (digit - 26) as u8) as char,
    }
}

#[cfg(test)]
mod tests {
    use super::encode;

    #[test]
    fn matches_reference_encodings() {
        // Outputs of the previously used `punycode` crate
        let cases = [
            ("Hello World", "Hello World-"),
            ("  Team   Meeting  ", "  Team   Meeting  -"),
            ("Café Crème", "Caf Crme-60ag"),
            ("Über straße", "ber strae-k0a5b"),
            ("日本語のイベント", "u9jxfmevcwg6105ao4bc84j"),
            ("🦀 Crab Party 🦀", " Crab Party -k758kma"),
            ("", ""),
            ("   ", "   -"),
            ("abc", "abc-"),
            ("ñ", "ida"),
            ("Ünïcödé Ståř Fït", "ncd St Ft-k0a9hxbxej0h42f"),
            ("Ｆｕｌｌｗｉｄｔｈ", "uh7c5bmcoa2ddu"),
            ("a-b_c.d", "a-b_c.d-"),
            ("Мероприятие", "o0a4cala8ahgcv6l"),
            ("x\ty\nz", "x\ty\nz-"),
            ("MiXeD CaSe 123", "MiXeD CaSe 123-"),
            ("ελληνικά", "hxargifdar"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                encode(input).as_deref(),
                Some(expected),
                "encoding {input:?}"
            );
        }
    }

    #[test]
    fn rfc_3492_sample() {
        // Section 7.1 (B) Chinese (simplified)
        assert_eq!(
            encode("他们为什么不说中文").as_deref(),
            Some("ihqwcrb4cv8a8dqg056pqjye")
        );
    }
}
