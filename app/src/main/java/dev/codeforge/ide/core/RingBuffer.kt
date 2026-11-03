package dev.codeforge.ide.core

/** Fixed-size byte ring used to replay recent terminal output when the UI re-attaches. */
class RingBuffer(private val cap: Int) {
    private val buf = ByteArray(cap)
    private var start = 0
    private var size = 0

    @Synchronized
    fun write(src: ByteArray, off: Int, len: Int) {
        if (len <= 0) return
        if (len >= cap) {
            System.arraycopy(src, off + len - cap, buf, 0, cap)
            start = 0
            size = cap
            return
        }
        val end = (start + size) % cap
        val first = minOf(len, cap - end)
        System.arraycopy(src, off, buf, end, first)
        if (len > first) System.arraycopy(src, off + first, buf, 0, len - first)
        val newSize = size + len
        if (newSize > cap) {
            start = (start + (newSize - cap)) % cap
            size = cap
        } else {
            size = newSize
        }
    }

    @Synchronized
    fun snapshot(): ByteArray {
        val out = ByteArray(size)
        val first = minOf(size, cap - start)
        System.arraycopy(buf, start, out, 0, first)
        if (size > first) System.arraycopy(buf, 0, out, first, size - first)
        return out
    }
}
